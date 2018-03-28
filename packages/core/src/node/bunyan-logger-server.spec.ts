/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as chai from "chai";
import * as yargs from 'yargs';
import * as temp from 'temp';
import * as fs from 'fs';
import { ContainerModule, Container } from "inversify";
import { LogLevelCliContribution } from "./bunyan-logger-server";
import { LogLevel } from "../common/logger";

// Allow creating temporary files, but remove them when we are done.
const track = temp.track();

const expect = chai.expect;

let cli: LogLevelCliContribution;

beforeEach(() => {
    const container = new Container();

    const module = new ContainerModule(bind => {
        bind(LogLevelCliContribution).toSelf().inSingletonScope();
    });

    container.load(module);

    cli = container.get(LogLevelCliContribution);
    yargs.reset();
    cli.configure(yargs);
});

describe('log-level-cli-contribution', function () {

    it('should use --log-level flag', () => {
        const args: yargs.Arguments = yargs.parse(['--log-level=debug']);
        cli.setArguments(args);

        expect(cli.defaultLogLevel).eq(LogLevel.DEBUG);
    });

    it('should read json config file', () => {
        const file = track.openSync();
        fs.writeFileSync(file.fd, JSON.stringify({
            default: 'info',
            loggers: {
                'hello': 'debug',
                'world': 'fatal',
            }
        }));

        const args: yargs.Arguments = yargs.parse(['--log-levels-file', file.path]);
        cli.setArguments(args);

        expect(cli.defaultLogLevel).eq(LogLevel.INFO);
        expect(cli.logLevels).eql({
            hello: LogLevel.DEBUG,
            world: LogLevel.FATAL,
        });
    });

    it('should use info as default log level', () => {
        const args: yargs.Arguments = yargs.parse([]);
        cli.setArguments(args);

        expect(cli.defaultLogLevel).eq(LogLevel.INFO);
        expect(cli.logLevels).eql({});
    });

    it('should reject wrong default log level', () => {
        const file = track.openSync();
        fs.writeFileSync(file.fd, JSON.stringify({
            default: 'potato',
            loggers: {
                'hello': 'debug',
                'world': 'fatal',
            }
        }));

        const args: yargs.Arguments = yargs.parse(['--log-levels-file', file.path]);
        expect(() => cli.setArguments(args)).to.throw(Error, 'Unknown default log level in');
    });

    it('should reject wrong logger log level', () => {
        const file = track.openSync();
        fs.writeFileSync(file.fd, JSON.stringify({
            default: 'info',
            loggers: {
                'hello': 'potato',
                'world': 'fatal',
            }
        }));

        const args: yargs.Arguments = yargs.parse(['--log-levels-file', file.path]);
        expect(() => cli.setArguments(args)).to.throw(Error, 'Unknown log level for logger hello in');
    });

    it('should reject nonexistent config files', () => {
        const args: yargs.Arguments = yargs.parse(['--log-levels-file', '/patch/doesnt/exist']);
        expect(() => cli.setArguments(args)).to.throw(Error, 'no such file or directory');
    });

    it('should reject config file with invalid JSON', () => {
        const file = track.openSync();
        const text = JSON.stringify({
            default: 'info',
            loggers: {
                'hello': 'potato',
                'world': 'fatal',
            }
        });
        fs.writeFileSync(file.fd, '{' + text);

        const args: yargs.Arguments = yargs.parse(['--log-levels-file', file.path]);
        expect(() => cli.setArguments(args)).to.throw(Error, 'Unexpected token { in JSON at position 1');
    });
});
