/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TelemetryService } from '@redhat-developer/vscode-redhat-telemetry';
import { CloseAction, ErrorAction, ErrorHandler, Message } from 'vscode-languageclient/node';
import * as vscode from 'vscode';

export class TelemetryErrorHandler implements ErrorHandler {
  private restarts: number[] = [];
  constructor(
    private readonly telemetry: TelemetryService,
    private readonly name: string,
    private readonly maxRestartCount: number
  ) {}

  error(error: Error, message: Message, count: number): ErrorAction {
    this.telemetry.send({ name: 'yaml.lsp.error', properties: { jsonrpc: message.jsonrpc, error: error.message } });
    if (count && count <= 3) {
      return ErrorAction.Continue;
    }
    return ErrorAction.Shutdown;
  }
  closed(): CloseAction {
    this.restarts.push(Date.now());
    if (this.restarts.length <= this.maxRestartCount) {
      return CloseAction.Restart;
    } else {
      const diff = this.restarts[this.restarts.length - 1] - this.restarts[0];
      if (diff <= 3 * 60 * 1000) {
        vscode.window.showErrorMessage(
          `The ${this.name} server crashed ${
            this.maxRestartCount + 1
          } times in the last 3 minutes. The server will not be restarted.`
        );
        return CloseAction.DoNotRestart;
      } else {
        this.restarts.shift();
        return CloseAction.Restart;
      }
    }
  }
}

const errorMassagesToSkip = [{ text: 'Warning: Setting the NODE_TLS_REJECT_UNAUTHORIZED', contains: true }];

export class TelemetryOutputChannel implements vscode.OutputChannel {
  constructor(private readonly delegate: vscode.OutputChannel, private readonly telemetry: TelemetryService) {}
  replace(value: string): void {
    //do nothing
    //throw new Error('Method not implemented.');
  }

  get name(): string {
    return this.delegate.name;
  }
  append(value: string): void {
    this.checkError(value);
    this.delegate.append(value);
  }
  appendLine(value: string): void {
    this.checkError(value);
    this.delegate.appendLine(value);
  }

  private checkError(value: string): void {
    console.log('checkError', value);
    if (value.startsWith('[Error') || value.startsWith('  Message: Request')) {
      if (this.isNeedToSkip(value)) {
        return;
      }
      this.telemetry.send({ name: 'yaml.server.error', properties: { error: this.createErrorMessage(value) } });
    }
  }

  private isNeedToSkip(value: string): boolean {
    for (const skip of errorMassagesToSkip) {
      if (skip.contains) {
        if (value.includes(skip.text)) {
          return true;
        }
      } else {
        const starts = value.startsWith(skip.text);
        if (starts) {
          return true;
        }
      }
    }

    return false;
  }

  private createErrorMessage(value: string): string {
    if (value.startsWith('[Error')) {
      value = value.substr(value.indexOf(']') + 1, value.length).trim();
    }

    return value;
  }

  clear(): void {
    this.delegate.clear();
  }
  show(preserveFocus?: boolean): void;
  show(column?: vscode.ViewColumn, preserveFocus?: boolean): void;
  show(column?: never, preserveFocus?: boolean): void {
    this.delegate.show(column, preserveFocus);
  }
  hide(): void {
    this.delegate.hide();
  }
  dispose(): void {
    this.delegate.dispose();
  }
}
