import { Disposable } from "botframework-emulator-shared/built/base/lifecycle/disposable";
import { ICommandService } from "botframework-emulator-shared/built/platform/commands";
import { CommandRegistry } from "botframework-emulator-shared/built/platform/commands/commandRegistry";
import { Channel } from "botframework-emulator-shared/built/platform/ipc/channel";
import { uniqueId } from 'botframework-emulator-shared/built/utils';
import { Window } from "../window";

export class CommandService extends Disposable implements ICommandService {

  private _channel: Channel;

  constructor(private _window: Window) {
    super();
    this._channel = new Channel('commandService', this._window.ipc);
    this.toDispose(
      this._window.ipc.registerChannel(this._channel));
    this.toDispose(
      this._channel.setListener('call', (commandName: string, transactionId: string, ...args: any[]) => {
        this.call(commandName, ...args)
          .then(result => {
            result = Array.isArray(result) ? result : [result];
            this._channel.send(transactionId, true, ...result);
          })
          .catch(err => {
            err = err.message ? err.message : err;
            this._channel.send(transactionId, false, err);
          })
      }));
  }

  call<T = any>(commandName: string, ...args: any[]): Promise<T> {
    const command = CommandRegistry.getCommand(commandName);
    try {
      if (!command) {
        throw new Error(`Command '${commandName}' not found`);
      } else {
        const result = command.handler<T>(this._window, ...args);
        return Promise.resolve(result);
      }
    } catch (err) {
      return Promise.reject(err);
    }
  }

  remoteCall<T = any>(commandName: string, ...args: any[]): Promise<T> {
    const transactionId = uniqueId();
    this._channel.send('call', commandName, transactionId, ...args);
    return new Promise<T>((resolve, reject) => {
      this._channel.setListener(transactionId, (success: boolean, ...responseArgs: any[]) => {
        this._channel.clearListener(transactionId);
        if (success) {
          let result = responseArgs.length ? responseArgs.shift() : undefined;
          resolve(result);
        }
        else {
          reject(responseArgs.shift());
        }
      });
    });
  }
}