# twitt2patcher
Patcher for old (v2.0.0) Twitter for Android app
# What is this?
twitt2patcher is a simple "web app" that spits out a modified Twitter v2.0.0 APK with different API URL's, so you can use it with projects like [butterflybridge](https://github.com/ftde0/butterflybridge) or [TwiterAPIBridge](https://github.com/Preloading/TwitterAPIBridge). I might provide a publically available instance later, but right now if you want to give it a spin you should probably just selfhost this.

~~Don't look at the code if you don't like looking at shit though.~~
# Stuff you'll need for selfhosting
- Node.js version 18 or later
- Java JRE 1.8.0 (aka. Java 8) or it's binaries. **Note that it has to be this specific version, otherwise stuff will break (believe me, I tried)!**
- A copy of [ApkRenamer](https://github.com/dvaoru/ApkRenamer). It's distribution also includes Apktool and SignApk, that are used by this project.
- A copy of Twitter v2.0.0 APK. You can find it on ApkMirror for example.

# Selfhosting
- Clone the repository.
- Run `npm i` in it.
- Edit `config.json`.
- Decompile Twitter v2.0.0 APK using Apktool. You can find it in `bin` folder of ApkRenamer.
- Put the decompiled Twitter APK's contents in `unpackedTwitterAPK`
- If running on Linux, make sure that `zipalign` binary in ApkRenamer's `bin` folder is executable. (Just run `chmod +x zipalign` in it)
- Start with `node .`
- Enjoy!
