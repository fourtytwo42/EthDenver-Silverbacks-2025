const fs = require('fs').promises;
const path = require('path');

// Configuration for excluded items
const excludedDirs = ['node_modules', 'uploads', 'upload'];
const excludedFiles = ['package-lock.json', 'compileText.bat', 'notes.txt'];
const excludedExtensions = [
    '.sqlite',
    // Style extensions
    '.css',
    // Image extensions
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico', 
    '.svg', '.webp', '.tiff', '.tif', '.avif', '.log', '.txt',
    // Case variations
    '.JPG', '.JPEG', '.PNG', '.GIF', '.BMP', '.ICO',
    '.SVG', '.WEBP', '.TIFF', '.TIF', '.AVIF', '.sqlite-journal',
    '.CSS',  // Adding uppercase variant for consistency

    '.json'
];

// Function to check if a path contains any excluded directory
function containsExcludedDir(filePath) {
    const normalizedPath = filePath.replace(/\\/g, '/'); // Normalize path separators
    return excludedDirs.some(dir => normalizedPath.includes(`/${dir}/`));
}

// Function to check if a file might be binary
async function isBinaryFile(filePath) {
    try {
        // Read the first 4096 bytes of the file
        const fd = await fs.open(filePath, 'r');
        const buffer = Buffer.alloc(4096);
        const { bytesRead } = await fd.read(buffer, 0, 4096, 0);
        await fd.close();

        // Check for null bytes or non-text characters
        for (let i = 0; i < bytesRead; i++) {
            if (buffer[i] === 0 || (buffer[i] < 7 && buffer[i] !== 5)) {
                return true;
            }
        }
        return false;
    } catch (err) {
        console.error(`Error checking if file is binary: ${filePath}`, err);
        return true; // Assume binary on error
    }
}

async function compileText(startPath) {
    let output = '';

    async function processDirectory(dirPath) {
        try {
            const items = await fs.readdir(dirPath, { withFileTypes: true });

            for (const item of items) {
                const fullPath = path.join(dirPath, item.name);
                
                // Skip if path contains any excluded directory
                if (containsExcludedDir(fullPath)) {
                    continue;
                }

                // Process directories
                if (item.isDirectory()) {
                    await processDirectory(fullPath);
                    continue;
                }

                // Skip excluded files and extensions
                const ext = path.extname(item.name).toLowerCase();
                if (excludedFiles.includes(item.name) ||
                    excludedExtensions.includes(ext)) {
                    continue;
                }

                try {
                    // Skip binary files
                    if (await isBinaryFile(fullPath)) {
                        continue;
                    }

                    const content = await fs.readFile(fullPath, 'utf8');
                    
                    // Skip if content can't be decoded as UTF-8
                    if (content.includes('�')) {
                        continue;
                    }

                    output += `----------------------------------------\n`;
                    output += `${fullPath}\n`;
                    output += `----------------------------------------\n`;
                    output += `${content}\n`;
                    output += `========================================\n\n`;
                } catch (err) {
                    console.error(`Error reading file ${fullPath}:`, err);
                }
            }
        } catch (err) {
            console.error(`Error processing directory ${dirPath}:`, err);
        }
    }

    await processDirectory(startPath);
    return output;
}

async function main() {
    try {
        // Use current directory as start path
        const startPath = process.cwd();
        const output = await compileText(startPath);
        
        // Write to output file
        const outputPath = path.join(startPath, 'compiled_output.txt');
        await fs.writeFile(outputPath, output);
        console.log(`Compilation complete! Output written to: ${outputPath}`);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

main();