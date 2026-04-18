import Constants from 'expo-constants';
import { Platform } from 'react-native';

export interface AppVersionInfo {
  version: string;
  buildNumber: string | null;
  runtimeVersion: string | null;
  channel: string | null;
  updateId: string | null;
  platform: string;
}

function getUpdatesInfo(): {
  runtimeVersion: string | null;
  channel: string | null;
  updateId: string | null;
} {
  try {
    const Updates = require('expo-updates');
    return {
      runtimeVersion:
        (Updates.runtimeVersion as string | undefined) ??
        (Constants.expoConfig?.runtimeVersion as string | undefined) ??
        null,
      channel: (Updates.channel as string | null | undefined) ?? null,
      updateId: (Updates.updateId as string | null | undefined) ?? null,
    };
  } catch {
    return { runtimeVersion: null, channel: null, updateId: null };
  }
}

export function getAppVersion(): AppVersionInfo {
  const version = Constants.expoConfig?.version ?? '0.0.0';
  const iosBuild = Constants.expoConfig?.ios?.buildNumber ?? null;
  const androidVersionCode =
    Constants.expoConfig?.android?.versionCode != null
      ? String(Constants.expoConfig.android.versionCode)
      : null;
  const buildNumber = Platform.OS === 'ios' ? iosBuild : androidVersionCode;

  return {
    version,
    buildNumber,
    platform: Platform.OS,
    ...getUpdatesInfo(),
  };
}

export function getVersionLabel(): string {
  const v = getAppVersion();
  const build = v.buildNumber ? ` (${v.buildNumber})` : '';
  return `v${v.version}${build}`;
}
