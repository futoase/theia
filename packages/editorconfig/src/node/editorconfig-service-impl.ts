/*
 * Copyright (C) 2018 Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { WorkspaceServer } from "@theia/workspace/lib/common";
import * as editorconfig from 'editorconfig';
import { KnownProps } from "editorconfig";
import { EditorconfigService } from "../common/editorconfig-interface";

@injectable()
export class EditorconfigServiceImpl implements EditorconfigService {

    constructor(
        @inject(WorkspaceServer) protected readonly workspaceServer: WorkspaceServer
    ) { }

    getConfig(file: string): Promise<KnownProps> {
        return new Promise((resolve, reject) => {
            this.workspaceServer.getRoot().then(root => {
                if (root) {
                    if (root.startsWith("file://")) {
                        root = root.substring("file://".length);
                    }

                    editorconfig.parse(file)
                        .then(config => {
                            resolve(config);
                        }).catch(reason => {
                            reject(reason);
                        });
                } else {
                    reject();
                }
            }).catch(reason => {
                reject(reason);
            });

        });
    }

}
