export type Runner = "node";

export type LaunchCommand = {
  command: string;
  args: string[];
};

export type SetupRenderContext = {
  serverName: string;
  envFilePath: string;
  repositoryPath: string;
  entryPoint: string;
  runner: Runner;
  isLocalDev: boolean;
  launchCommand: LaunchCommand;
  environment?: Record<string, string>;
};

export type ClientSnippet = {
  name: string;
  configPath: string;
  snippet: string;
  notes: string[];
};

export type ClientWriteOptions = {
  printOnly?: boolean;
  filePathOverride?: string;
};

export type ClientWriteResult = {
  name: string;
  path: string;
  wrote: boolean;
  backupPath?: string;
  snippet: string;
};
