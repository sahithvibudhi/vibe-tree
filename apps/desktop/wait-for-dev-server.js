const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function waitForPortFile() {
  return new Promise((resolve) => {
    const portFile = path.join(__dirname, '.dev-port');
    let lastPort = null;
    let stableCount = 0;

    const checkFile = () => {
      if (fs.existsSync(portFile)) {
        const port = fs.readFileSync(portFile, 'utf8').trim();

        // Wait for port to be stable for at least 500ms
        if (port === lastPort) {
          stableCount++;
        } else {
          lastPort = port;
          stableCount = 0;
        }

        if (stableCount >= 5) {
          // 5 * 100ms = 500ms stable
          resolve(port);
        } else {
          setTimeout(checkFile, 100);
        }
      } else {
        setTimeout(checkFile, 100);
      }
    };
    checkFile();
  });
}

async function main() {
  const port = await waitForPortFile();
  console.log(`Dev server port: ${port}, waiting for server to be ready...`);

  // Use the locally installed wait-on through the current node binary:
  // going through npx breaks on machines whose global npx shim is not
  // executable, and wait-on is already a devDependency of this package
  const waitOnBin = require.resolve('wait-on/bin/wait-on');
  const waitOn = spawn(process.execPath, [waitOnBin, `tcp:${port}`], { stdio: 'inherit' });
  waitOn.on('close', (code) => {
    if (code === 0) {
      console.log('Dev server is ready!');
    }
    process.exit(code);
  });
}

main().catch(console.error);
