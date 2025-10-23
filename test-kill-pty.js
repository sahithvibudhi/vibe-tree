#!/usr/bin/env node

// Simple test to verify PTY process killing works
const pty = require('node-pty');
const fs = require('fs');
const path = require('path');

const testFile = `/tmp/pty-kill-test-${Date.now()}.txt`;

console.log(`Test file: ${testFile}`);

// Spawn a PTY
const ptyProcess = pty.spawn('/bin/bash', [], {
  name: 'xterm-256color',
  cols: 80,
  rows: 30,
  cwd: process.cwd(),
  env: process.env
});

const pid = ptyProcess.pid;
console.log(`PTY PID: ${pid}`);

// Wait for shell to be ready
setTimeout(() => {
  // Start a loop that writes timestamps
  ptyProcess.write(`while true; do date +%s.%N > ${testFile}; sleep 0.1; done\r`);
  console.log('Started timestamp writing process');

  // Wait for process to start writing
  setTimeout(() => {
    console.log('File exists:', fs.existsSync(testFile));

    if (!fs.existsSync(testFile)) {
      console.error('Test file was not created!');
      ptyProcess.kill('SIGKILL');
      process.exit(1);
    }

    // Read initial content
    const initial = fs.readFileSync(testFile, 'utf-8');
    console.log('Initial timestamp:', initial.trim());

    // Wait a bit
    setTimeout(() => {
      const updated = fs.readFileSync(testFile, 'utf-8');
      console.log('Updated timestamp:', updated.trim());
      console.log('File is being updated:', initial !== updated);

      // Now try to kill the process group
      console.log(`\nAttempting to kill process group -${pid}...`);

      try {
        process.kill(-pid, 'SIGTERM');
        console.log('✓ Sent SIGTERM to process group');
      } catch (error) {
        console.error('✗ Failed to kill process group:', error.message);

        // Fallback to killing PTY process
        console.log('Fallback: killing PTY process directly');
        ptyProcess.kill('SIGTERM');
      }

      // Wait and check if process stopped
      setTimeout(() => {
        const afterKill = fs.readFileSync(testFile, 'utf-8');
        console.log('After kill:', afterKill.trim());

        setTimeout(() => {
          const final = fs.readFileSync(testFile, 'utf-8');
          console.log('Final check:', final.trim());

          if (afterKill === final) {
            console.log('\n✓ SUCCESS: Process was killed (file stopped updating)');
          } else {
            console.log('\n✗ FAILURE: Process is still running (file still updating)');

            // Force kill
            console.log('Force killing...');
            try {
              process.kill(-pid, 'SIGKILL');
            } catch (e) {
              ptyProcess.kill('SIGKILL');
            }
          }

          // Cleanup
          setTimeout(() => {
            if (fs.existsSync(testFile)) {
              fs.unlinkSync(testFile);
            }
            process.exit(afterKill === final ? 0 : 1);
          }, 500);
        }, 500);
      }, 1000);
    }, 300);
  }, 1000);
}, 500);
