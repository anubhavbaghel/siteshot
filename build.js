const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const distDir = path.join(__dirname, 'dist-installer');
const versionsDir = path.join(distDir, 'versions');

console.log('Preparing build directory...');

// 1. Ensure versions directory exists
if (!fs.existsSync(versionsDir)) {
  fs.mkdirSync(versionsDir, { recursive: true });
}

// 2. Find and archive previous setup installers to the versions folder
if (fs.existsSync(distDir)) {
  const files = fs.readdirSync(distDir);
  for (const file of files) {
    if (file.startsWith('siteshot-desktop Setup') && file.endsWith('.exe')) {
      const srcPath = path.join(distDir, file);
      const destPath = path.join(versionsDir, file);
      try {
        console.log(`Archiving previous version: ${file} -> versions/${file}`);
        fs.renameSync(srcPath, destPath);
      } catch (err) {
        console.error(`Failed to archive ${file}: ${err.message}`);
      }
    }
  }

  // 3. Clean intermediate build cache files to prevent makensis errors
  const filesAfterMove = fs.readdirSync(distDir);
  for (const file of filesAfterMove) {
    const filePath = path.join(distDir, file);
    if (file.endsWith('.7z') || file.startsWith('__uninstaller') || file === 'builder-debug.yml') {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.warn(`Could not delete temp file ${file}: ${err.message}`);
      }
    }
  }
}

// 4. Run electron-builder
console.log('Starting electron-builder compilation...');
try {
  execSync('npx.cmd electron-builder --win', { stdio: 'inherit' });
  console.log('Build completed successfully.');
} catch (error) {
  console.error('Compilation failed:', error.message);
  process.exit(1);
}
