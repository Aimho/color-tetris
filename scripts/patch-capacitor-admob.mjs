import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const buildFile = fileURLToPath(new URL(
  '../node_modules/@capacitor-community/admob/android/build.gradle',
  import.meta.url,
));
const legacyConfig = "getDefaultProguardFile('proguard-android.txt')";
const optimizedConfig = "getDefaultProguardFile('proguard-android-optimize.txt')";
const source = await readFile(buildFile, 'utf8');

if (source.includes(optimizedConfig)) {
  process.exit(0);
}

if (!source.includes(legacyConfig)) {
  throw new Error('Unsupported @capacitor-community/admob ProGuard configuration');
}

await writeFile(buildFile, source.replaceAll(legacyConfig, optimizedConfig));
console.log('Patched @capacitor-community/admob for AGP 9 optimized R8 builds.');
