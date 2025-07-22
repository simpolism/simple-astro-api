#!/bin/bash
set -e

echo "Building with GLIBC compatibility for Ubuntu 24.04 -> runtime compatibility"

# Check current GLIBC version
echo "Build environment GLIBC version:"
ldd --version | head -1

# Clean any existing builds
echo "Cleaning previous builds..."
rm -rf node_modules/sweph/build

# Install dependencies
echo "Installing dependencies..."
npm ci

# Set environment variables for compatible compilation
export CC=gcc
export CXX=g++
export CFLAGS="-O2 -fPIC"
export CXXFLAGS="-O2 -fPIC"
export LDFLAGS="-Wl,--no-as-needed"

# Force rebuild sweph native module
echo "Rebuilding sweph native module..."
npm rebuild sweph --build-from-source

# Verify the built binary
echo "Checking built binary dependencies:"
if [ -f "node_modules/sweph/build/Release/sweph.node" ]; then
    ldd node_modules/sweph/build/Release/sweph.node | grep -E "(GLIBC|libc)" || echo "No GLIBC dependencies found"
else
    echo "Warning: sweph.node not found after build"
fi

# Build TypeScript
echo "Building TypeScript..."
npm run build

echo "Build completed successfully!"
