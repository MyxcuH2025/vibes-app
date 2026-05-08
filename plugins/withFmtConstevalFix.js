/**
 * withFmtConstevalFix.js — Expo Config Plugin
 *
 * Xcode/Apple Clang can fail while compiling the fmt CocoaPod when fmt enables
 * C++20 consteval format-string checks. Keep the workaround scoped to the fmt
 * pod by compiling it as C++17.
 */

const { withPodfile } = require('@expo/config-plugins');

const MARKER = 'withFmtConstevalFix:v2';

const PATCH = `
    # ${MARKER}: avoid fmt C++20 consteval failures on Apple Clang
    installer.pods_project.targets.each do |target|
      next unless target.name == 'fmt'
      target.build_configurations.each do |config|
        config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
      end
    end

    Dir.glob(File.join(__dir__, 'Pods', 'Target Support Files', 'fmt', 'fmt.*.xcconfig')).each do |xcconfig|
      contents = File.read(xcconfig)
      contents = contents.gsub(/CLANG_CXX_LANGUAGE_STANDARD = .*/, 'CLANG_CXX_LANGUAGE_STANDARD = c++17')
      File.write(xcconfig, contents)
    end
`;

function addFmtConstevalFix(contents) {
  if (contents.includes(MARKER)) return contents;

  const reactNativePostInstall = /(\n\s*react_native_post_install\([\s\S]*?\n\s*\)\n)/;
  if (!reactNativePostInstall.test(contents)) {
    throw new Error('withFmtConstevalFix: could not find react_native_post_install in ios/Podfile');
  }

  return contents.replace(reactNativePostInstall, `$1${PATCH}`);
}

module.exports = function withFmtConstevalFix(config) {
  return withPodfile(config, (mod) => {
    mod.modResults.contents = addFmtConstevalFix(mod.modResults.contents);
    return mod;
  });
};
