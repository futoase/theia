/*
 * Copyright (C) 2018 Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { MonacoEditor } from "@theia/monaco/lib/browser/monaco-editor";
import { injectable, inject, postConstruct } from "inversify";
import { EditorManager, EditorWidget, TextEditor } from "@theia/editor/lib/browser";
import { EditorconfigService } from "../common/editorconfig-interface";
import { KnownProps } from "editorconfig";
import { isNumber } from "util";
import { CommandService } from "@theia/core";

const LINE_ENDING = {
    LF: '\n',
    CRLF: '\r\n'
};

@injectable()
export class DocumentWatcher {

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(EditorconfigService)
    protected readonly editorconfigServer: EditorconfigService;

    @inject(CommandService)
    protected readonly commandService: CommandService;

    private configurations: { [file: string]: KnownProps } = {};

    @postConstruct()
    protected init(): void {
        // refresh properties when opening an editor
        this.editorManager.onCreated(e => {
            this.addOnSaveHandler(e);
            this.refreshProperties(e.editor);
        });

        // refresh properties when changing an active editor
        this.editorManager.onCurrentEditorChanged(e => {
            if (e) {
                this.refreshProperties(e.editor);
            }
        });
    }

    /**
     * Adds handler to update editor properties before saving the document.
     *
     * @param editorWidget editor widget
     */
    protected addOnSaveHandler(editorWidget: EditorWidget) {
        if (editorWidget.editor instanceof MonacoEditor) {
            const monacoEditor: MonacoEditor = editorWidget.editor as MonacoEditor;
            monacoEditor.document.onWillSaveModel(() => {
                const file = monacoEditor.uri.path.toString();
                const properties: KnownProps = this.configurations[file];

                if (this.isSet(properties.trim_trailing_whitespace)) {
                    this.ensureTrimTrailingWhitespace(monacoEditor, properties);
                }

                if (this.isSet(properties.insert_final_newline)) {
                    this.ensureEndsWithNewLine(monacoEditor, properties);
                }
            });
        }
    }

    /**
     * Refreshes editorconfig properties for the editor.
     *
     * @param editor editor
     */
    protected refreshProperties(editor: TextEditor) {
        if (editor instanceof MonacoEditor) {
            const uri: string = editor.uri.path.toString();
            this.editorconfigServer.getConfig(uri).then(properties => {
                this.configurations[uri] = properties;
                this.applyProperties(properties, editor);
            });
        }
    }

    /**
     * Applies editorconfig properties for the editor.
     *
     * @param properties editorcofig properties
     * @param editor Monaco editor
     */
    applyProperties(properties: KnownProps, editor: MonacoEditor): void {
        if (this.isSet(properties.indent_style)) {
            this.ensureIndentStyle(editor, properties);
        }

        if (this.isSet(properties.indent_size)) {
            this.ensureIndentSize(editor, properties);
        }

        if (this.isSet(properties.end_of_line)) {
            this.ensureEndOfLine(editor, properties);
        }

        if (this.isSet(properties.trim_trailing_whitespace)) {
            this.ensureTrimTrailingWhitespace(editor, properties);
        }

        if (this.isSet(properties.insert_final_newline)) {
            this.ensureEndsWithNewLine(editor, properties);
        }
    }

    /**
     * Determines whether property is set.
     */
    isSet(property: any): boolean {
        if (!property || 'unset' === property) {
            return false;
        }

        return true;
    }

    /**
     * indent_style: set to tab or space to use hard tabs or soft tabs respectively.
     */
    ensureIndentStyle(editor: MonacoEditor, properties: KnownProps): void {
        if ('space' === properties.indent_style) {
            editor.document.textEditorModel.updateOptions({
                insertSpaces: true
            });
        } else if ('tab' === properties.indent_style) {
            editor.document.textEditorModel.updateOptions({
                insertSpaces: false
            });
        }
    }

    /**
     * indent_size: a whole number defining the number of columns
     * used for each indentation level and the width of soft tabs (when supported).
     * When set to tab, the value of tab_width (if specified) will be used.
     */
    ensureIndentSize(editor: MonacoEditor, properties: KnownProps): void {
        if ('tab' === properties.indent_size) {
            if (this.isSet(properties.tab_width)) {
                this.ensureTabWidth(editor, properties);
            }
        } else if (isNumber(properties.indent_size)) {
            const indentSize: number = properties.indent_size as number;
            editor.document.textEditorModel.updateOptions({
                tabSize: indentSize
            });
        }
    }

    /**
     * tab_width: a whole number defining the number of columns
     * used to represent a tab character. This defaults to the value of
     * indent_size and doesn't usually need to be specified.
     */
    ensureTabWidth(editor: MonacoEditor, properties: KnownProps): void {
        if (isNumber(properties.tab_width)) {
            const tabWidth: number = properties.tab_width as number;
            editor.document.textEditorModel.updateOptions({
                tabSize: tabWidth
            });
        }
    }

    /**
     * end_of_line: set to lf or crlf to control how line breaks are represented.
     */
    ensureEndOfLine(editor: MonacoEditor, properties: KnownProps): void {
        if ('lf' === properties.end_of_line) {
            editor.document.textEditorModel.setEOL(monaco.editor.EndOfLineSequence.LF);
        } else if ('crlf' === properties.end_of_line) {
            editor.document.textEditorModel.setEOL(monaco.editor.EndOfLineSequence.CRLF);
        }
    }

    /**
     * trim_trailing_whitespace: set to true to remove any whitespace characters
     * preceding newline characters and false to ensure it doesn't.
     */
    ensureTrimTrailingWhitespace(editor: MonacoEditor, properties: KnownProps): void {
        if (true === properties.trim_trailing_whitespace) {
            if (this.editorManager.currentEditor && this.editorManager.currentEditor.editor === editor) {
                this.commandService.executeCommand('monaco.editor.action.trimTrailingWhitespace');
            }
        }
    }

    /**
     * insert_final_newline: set to true to ensure file ends with a newline
     * when saving and false to ensure it doesn't.
     */
    ensureEndsWithNewLine(editor: MonacoEditor, properties: KnownProps): void {
        if (true === properties.insert_final_newline) {
            const lines = editor.document.lineCount;
            let lineContent: string = editor.document.textEditorModel.getLineContent(lines);

            if (true === properties.trim_trailing_whitespace) {
                lineContent = lineContent.trimRight();
            }

            const lineEnding = 'crlf' === properties.end_of_line ? LINE_ENDING.CRLF : LINE_ENDING.LF;

            if ("" !== lineContent) {
                // remember cursor position
                const cursor = editor.cursor;

                // insert new line character
                const edit = {
                    identifier: undefined!,
                    forceMoveMarkers: false,
                    range: new monaco.Range(lines, lineContent.length + 1, lines, lineContent.length + 1),
                    text: lineEnding
                } as monaco.editor.IIdentifiedSingleEditOperation;
                editor.document.textEditorModel.applyEdits([edit]);

                // restore cursor position
                editor.cursor = cursor;
            }
        }
    }

}
