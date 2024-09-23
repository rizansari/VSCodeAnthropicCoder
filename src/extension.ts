import * as vscode from 'vscode';
import * as fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { SidebarProvider } from './SidebarProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "anthropic-code-generator" is now active!');

    const sidebarProvider = new SidebarProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider("anthropicCodeGenerator", sidebarProvider)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('anthropic-coder.generateCode', async (prompt: string, files: string[], webviewView: vscode.WebviewView) => {
            console.log('Generating code for: ' + prompt);
            const apiKey = vscode.workspace.getConfiguration().get('anthropic-coder.apiKey') as string;
            const model = vscode.workspace.getConfiguration().get('anthropic-coder.model') as string;
            const maxTokens = vscode.workspace.getConfiguration().get('anthropic-coder.maxTokens') as number;

            if (!apiKey || apiKey.trim() === '') {
                vscode.window.showWarningMessage('Please set your Anthropic API Key in the extension settings.');
                return;
            }

            if (!prompt || prompt.trim() === '') {
                vscode.window.showWarningMessage('Please provide a prompt to generate code.');
                return;
            }

            try {
                let fullResponse = '';
                const responseId = Date.now().toString();

                // Initialize the response container
                webviewView.webview.postMessage({
                    type: 'initializeResponse',
                    id: responseId,
                    prompt: prompt
                });

                const client = new Anthropic({
                    apiKey: apiKey
                });

                // Read file contents
                const fileContents = await Promise.all(files.map(async (file) => {
                    const content = await fs.promises.readFile(file, 'utf8');
                    return `File: ${file}\n\n${content}\n\n`;
                }));

                const fullPrompt = `${prompt}\n\nHere are the contents of the files:\n\n${fileContents.join('\n')}`;

                const stream = await client.messages.stream({
                    messages: [{ role: 'user', content: fullPrompt }],
                    model: model,
                    max_tokens: maxTokens,
                }).on('text', (text) => {
                    fullResponse += text;

                    // Send incremental updates
                    webviewView.webview.postMessage({
                        type: 'updateGeneratedCode',
                        id: responseId,
                        value: text
                    });
                });

                const message = await stream.finalMessage();

                // Send the final, complete response
                webviewView.webview.postMessage({
                    type: 'finalizeGeneratedCode',
                    id: responseId,
                    value: fullResponse
                });

                // add prompt to the top of the response with new line markdown
                fullResponse = `${prompt}\n\n${fullResponse}`;


                // open new untitled document with the generated code
                const doc = await vscode.workspace.openTextDocument({
                    content: fullResponse, language: 'markdown'
                });
                await vscode.window.showTextDocument(doc);

            } catch (error: any) {
                vscode.window.showErrorMessage('Error generating code: ' + error.message);
            }
        })


    );

    context.subscriptions.push(
        vscode.commands.registerCommand('anthropic-coder.changeModel', async () => {

            const defaultSettingsSchemaResource = vscode.Uri.parse('vscode://schemas/settings/default');
            const textDocument = await vscode.workspace.openTextDocument(defaultSettingsSchemaResource);
            const jsonObject = JSON.parse(textDocument.getText());

            const models = jsonObject.properties['anthropic-coder.model'].enum;
            const modelDescriptions = jsonObject.properties['anthropic-coder.model'].enumDescriptions;


            const config = vscode.workspace.getConfiguration('anthropic-coder');
            

            // create model options
            const modelOptions = models.map((model: string, index: number) => {
                return {
                    label: model,
                    description: modelDescriptions[index]
                };
            });

            const selectedModel: any = await vscode.window.showQuickPick(modelOptions, {
                placeHolder: 'Select the Anthropic model to use',
            });


            if (selectedModel) {
                await config.update('model', selectedModel.label, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`Switched to the '${selectedModel.label}' model.`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('anthropic-coder.changeMaxTokens', async () => {
            const defaultSettingsSchemaResource = vscode.Uri.parse('vscode://schemas/settings/default');
            const textDocument = await vscode.workspace.openTextDocument(defaultSettingsSchemaResource);
            const jsonObject = JSON.parse(textDocument.getText());

            const options = jsonObject.properties['anthropic-coder.maxTokens'].enum;
            const optionDescriptions = jsonObject.properties['anthropic-coder.maxTokens'].enumDescriptions;


            const config = vscode.workspace.getConfiguration('anthropic-coder');
            

            
            const showOptions = options.map((option: number, index: number) => {
                return {
                    label: option.toString(),
                    description: optionDescriptions[index]
                };
            });

            const selectedModel: any = await vscode.window.showQuickPick(showOptions, {
                placeHolder: 'Select the max tokens to use',
            });


            if (selectedModel) {
                await config.update('maxTokens', Number.parseInt(selectedModel.label), vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`Switched to the '${selectedModel.label}' max tokens.`);
            }
        })
    );
}

export function deactivate() { }