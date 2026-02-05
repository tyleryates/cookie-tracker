// AfterPack script to remove unnecessary files and reduce app size
const fs = require('fs');
const path = require('path');

exports.default = async function(context) {
  const appOutDir = context.appOutDir;
  const electronFramework = path.join(
    appOutDir,
    'Cookie Tracker.app',
    'Contents',
    'Frameworks',
    'Electron Framework.framework',
    'Versions',
    'A'
  );

  // Files to remove (not needed for this app)
  const filesToRemove = [
    // Software GPU renderer (16MB) - not needed on modern Macs with hardware GPU
    path.join(electronFramework, 'Libraries', 'libvk_swiftshader.dylib'),
    path.join(electronFramework, 'Libraries', 'vk_swiftshader_icd.json'),

    // FFmpeg video/audio codecs (2.1MB) - app doesn't use media
    path.join(electronFramework, 'Libraries', 'libffmpeg.dylib'),
  ];

  // Remove files
  let totalSaved = 0;
  for (const file of filesToRemove) {
    if (fs.existsSync(file)) {
      const stats = fs.statSync(file);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
      fs.unlinkSync(file);
      totalSaved += stats.size;
      console.log(`  • removed ${path.basename(file)} (${sizeMB}MB)`);
    }
  }

  console.log(`  • total size reduction: ${(totalSaved / 1024 / 1024).toFixed(1)}MB`);
};
