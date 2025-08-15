#!/usr/bin/env node

import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicDir = path.join(__dirname, '../public');
const backupDir = path.join(__dirname, '../image-backups');

// Image extensions to convert
const imageExtensions = ['.png', '.jpg', '.jpeg'];

// Function to get file size in MB
const getFileSizeMB = async (filePath) => {
  const stats = await fs.stat(filePath);
  return (stats.size / (1024 * 1024)).toFixed(2);
};

// Function to ensure directory exists
const ensureDir = async (dir) => {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
};

// Function to optimize single image
const optimizeImage = async (filePath) => {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);
    const fileNameWithoutExt = path.basename(filePath, ext);
    
    if (!imageExtensions.includes(ext)) {
      return null;
    }
    
    // Skip if already optimized (has .webp version)
    const webpPath = path.join(path.dirname(filePath), `${fileNameWithoutExt}.webp`);
    try {
      await fs.access(webpPath);
      console.log(`⏭️  Skipping ${fileName} (WebP version already exists)`);
      return null;
    } catch {
      // WebP doesn't exist, proceed with conversion
    }
    
    const originalSizeMB = await getFileSizeMB(filePath);
    
    // Create backup
    const backupPath = path.join(backupDir, fileName);
    await fs.copyFile(filePath, backupPath);
    
    // Convert to WebP with high quality
    await sharp(filePath)
      .webp({ 
        quality: 85,
        effort: 6 
      })
      .toFile(webpPath);
    
    const newSizeMB = await getFileSizeMB(webpPath);
    const savings = ((originalSizeMB - newSizeMB) / originalSizeMB * 100).toFixed(1);
    
    console.log(`✅ ${fileName} → ${fileNameWithoutExt}.webp`);
    console.log(`   Size: ${originalSizeMB}MB → ${newSizeMB}MB (${savings}% smaller)`);
    
    return {
      original: fileName,
      webp: `${fileNameWithoutExt}.webp`,
      originalSizeMB: parseFloat(originalSizeMB),
      newSizeMB: parseFloat(newSizeMB),
      savings: parseFloat(savings)
    };
    
  } catch (error) {
    console.error(`❌ Error optimizing ${filePath}:`, error.message);
    return null;
  }
};

// Function to scan directory recursively
const scanDirectory = async (dir, files = []) => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      await scanDirectory(fullPath, files);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (imageExtensions.includes(ext)) {
        files.push(fullPath);
      }
    }
  }
  
  return files;
};

// Main optimization function
const optimizeImages = async () => {
  console.log('🚀 Starting image optimization...\n');
  
  try {
    // Ensure backup directory exists
    await ensureDir(backupDir);
    
    // Find all images
    const imageFiles = await scanDirectory(publicDir);
    console.log(`📁 Found ${imageFiles.length} images to process\n`);
    
    if (imageFiles.length === 0) {
      console.log('✨ No images found to optimize!');
      return;
    }
    
    // Process images
    const results = [];
    for (const filePath of imageFiles) {
      const result = await optimizeImage(filePath);
      if (result) {
        results.push(result);
      }
      console.log(''); // Add spacing
    }
    
    // Show summary
    if (results.length > 0) {
      const totalOriginalSize = results.reduce((sum, r) => sum + r.originalSizeMB, 0);
      const totalNewSize = results.reduce((sum, r) => sum + r.newSizeMB, 0);
      const totalSavings = ((totalOriginalSize - totalNewSize) / totalOriginalSize * 100).toFixed(1);
      
      console.log('📊 OPTIMIZATION SUMMARY');
      console.log('========================');
      console.log(`Images optimized: ${results.length}`);
      console.log(`Original size: ${totalOriginalSize.toFixed(2)}MB`);
      console.log(`Optimized size: ${totalNewSize.toFixed(2)}MB`);
      console.log(`Total savings: ${(totalOriginalSize - totalNewSize).toFixed(2)}MB (${totalSavings}%)`);
      console.log(`\n💾 Original files backed up to: ${backupDir}`);
      console.log('\n🔥 Your site will load much faster now!');
      
      // Generate update instructions
      console.log('\n📝 UPDATE YOUR CODE:');
      console.log('Replace PNG/JPG references with WebP in your React components:');
      results.forEach(r => {
        console.log(`   "${r.original}" → "${r.webp}"`);
      });
      
    } else {
      console.log('✨ All images already optimized!');
    }
    
  } catch (error) {
    console.error('💥 Error during optimization:', error.message);
    process.exit(1);
  }
};

// Run optimization
optimizeImages();