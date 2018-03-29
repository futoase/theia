/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from "inversify";
import { QuickOpenModel, QuickOpenItem, QuickOpenMode, QuickOpenService, OpenerService, KeybindingRegistry, Keybinding } from '@theia/core/lib/browser';
import { FileSystem, FileStat } from '@theia/filesystem/lib/common/filesystem';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import URI from '@theia/core/lib/common/uri';
import { FileSearchService } from '../common/file-search-service';
import { CancellationTokenSource } from '@theia/core/lib/common';
import { LabelProvider } from "@theia/core/lib/browser/label-provider";
import { Command } from '@theia/core/lib/common';

export const quickFileOpen: Command = {
    id: 'file-search.openFile',
    label: 'Open File ...'
};

@injectable()
export class QuickFileOpenService implements QuickOpenModel {

    @inject(KeybindingRegistry)
    protected readonly keybindingRegistry: KeybindingRegistry;

    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
        @inject(OpenerService) protected readonly openerService: OpenerService,
        @inject(QuickOpenService) protected readonly quickOpenService: QuickOpenService,
        @inject(FileSearchService) protected readonly fileSearchService: FileSearchService,
        @inject(LabelProvider) protected readonly labelProvider: LabelProvider
    ) {
        workspaceService.root.then(root => this.wsRoot = root);
    }

    private wsRoot: FileStat | undefined;
    private showIgnoredFiles: boolean = true;
    private opened: boolean = false;

    isEnabled(): boolean {
        return this.wsRoot !== undefined;
    }

    open(): void {
        let placeholderText = "";
        const keybinding = this.getKeyCommand();
        if (!!keybinding) {
            placeholderText = `File name to search press ${keybinding} to show/hide .gitignore files`;
        }
        if (!this.opened) {
            this.opened = true;
            this.quickOpenService.open(this, {
                placeholder: placeholderText,
                fuzzyMatchLabel: true,
                fuzzyMatchDescription: true,
                fuzzySort: true,
                onClose: () => {
                    this.showIgnoredFiles = true;
                    this.opened = false;
                }
            });
        } else {
            this.showIgnoredFiles = !this.showIgnoredFiles;
            this.quickOpenService.refresh();
        }
    }

    private getKeyCommand(): string | undefined {
        let keyCommandStr = "";
        const keyCommand = this.keybindingRegistry.getKeybindingsForCommand(quickFileOpen.id);
        if (keyCommand) {
            keyCommandStr = Keybinding.acceleratorFor(keyCommand[0]).join(" ");
            keyCommandStr = keyCommandStr.replace(" ", "+");
            return keyCommandStr;
        }
        return undefined;
    }

    private cancelIndicator = new CancellationTokenSource();

    public async onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): Promise<void> {
        if (!this.wsRoot) {
            return;
        }
        this.cancelIndicator.cancel();
        this.cancelIndicator = new CancellationTokenSource();
        const token = this.cancelIndicator.token;
        const proposed = new Set<string>();
        const rootUri = this.wsRoot.uri;
        const handler = async (result: string[]) => {
            if (!token.isCancellationRequested) {
                const root = new URI(rootUri);
                result.forEach(p => {
                    const uri = root.withPath(root.path.join(p)).toString();
                    proposed.add(uri);
                });
                const itemPromises = Array.from(proposed).map(uri => this.toItem(uri));
                acceptor(await Promise.all(itemPromises));
            }
        };
        this.fileSearchService.find(lookFor, {
            rootUri,
            fuzzyMatch: true,
            limit: 200,
            useGitIgnore: this.showIgnoredFiles
        }, token).then(handler);
    }

    private async toItem(uriString: string) {
        const uri = new URI(uriString);
        return new FileQuickOpenItem(uri,
            this.labelProvider.getName(uri),
            await this.labelProvider.getIcon(uri),
            this.labelProvider.getLongName(uri.parent),
            this.openerService);
    }

}

export class FileQuickOpenItem extends QuickOpenItem {

    constructor(
        protected readonly uri: URI,
        protected readonly label: string,
        protected readonly icon: string,
        protected readonly parent: string,
        protected readonly openerService: OpenerService
    ) {
        super();
    }

    getLabel(): string {
        return this.label;
    }

    isHidden(): boolean {
        return false;
    }

    getTooltip(): string {
        return this.uri.path.toString();
    }

    getDescription(): string {
        return this.parent;
    }

    getUri(): URI {
        return this.uri;
    }

    getIconClass(): string {
        return this.icon + ' file-icon';
    }

    run(mode: QuickOpenMode): boolean {
        if (mode !== QuickOpenMode.OPEN) {
            return false;
        }
        this.openerService.getOpener(this.uri).then(opener => opener.open(this.uri));
        return true;
    }
}
