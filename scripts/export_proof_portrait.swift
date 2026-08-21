#!/usr/bin/env swift

import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

private let canvasWidth = 640
private let canvasHeight = 800

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data("ERROR: \(message)\n".utf8))
    exit(1)
}

guard CommandLine.arguments.count == 3 else {
    fail("usage: export_proof_portrait.swift SOURCE.png TARGET.png")
}

let sourcePath = CommandLine.arguments[1]
let targetPath = CommandLine.arguments[2]
let sourceURL = URL(fileURLWithPath: sourcePath)
let targetURL = URL(fileURLWithPath: targetPath)

guard FileManager.default.fileExists(atPath: sourcePath) else {
    fail("source does not exist: \(sourcePath)")
}
guard !FileManager.default.fileExists(atPath: targetPath) else {
    fail("refusing to overwrite existing target: \(targetPath)")
}
guard let imageSource = CGImageSourceCreateWithURL(sourceURL as CFURL, nil),
      CGImageSourceGetCount(imageSource) == 1,
      let image = CGImageSourceCreateImageAtIndex(imageSource, 0, nil) else {
    fail("source is not a decodable single-frame image: \(sourcePath)")
}
guard image.alphaInfo != .none && image.alphaInfo != .noneSkipFirst && image.alphaInfo != .noneSkipLast else {
    fail("source does not provide an alpha channel: \(sourcePath)")
}

// A physical alpha channel is not enough: opaque PNGs can still advertise one.
// Decode the source pixels and require both a meaningful transparent area and a
// transparent surrounding canvas before any production export is written.
let sourceBytesPerRow = image.width * 4
let sourceColorSpace = CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB()
guard let sourceContext = CGContext(
    data: nil,
    width: image.width,
    height: image.height,
    bitsPerComponent: 8,
    bytesPerRow: sourceBytesPerRow,
    space: sourceColorSpace,
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
) else {
    fail("could not create the source alpha-inspection canvas")
}
sourceContext.clear(CGRect(x: 0, y: 0, width: image.width, height: image.height))
sourceContext.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
guard let sourceData = sourceContext.data else {
    fail("could not inspect source alpha pixels: \(sourcePath)")
}
let sourcePixels = sourceData.bindMemory(to: UInt8.self, capacity: sourceBytesPerRow * image.height)
var transparentPixels = 0
var fullyTransparentPixels = 0
for pixelIndex in 0..<(image.width * image.height) {
    let alpha = sourcePixels[pixelIndex * 4 + 3]
    if alpha < 250 { transparentPixels += 1 }
    if alpha == 0 { fullyTransparentPixels += 1 }
}
let minimumTransparentPixels = max(1, image.width * image.height / 100)
guard transparentPixels >= minimumTransparentPixels && fullyTransparentPixels > 0 else {
    fail("source lacks meaningful alpha transparency and appears to have an opaque rectangular background: \(sourcePath)")
}
let cornerPixelIndexes = [0, image.width - 1, (image.height - 1) * image.width, image.width * image.height - 1]
guard cornerPixelIndexes.allSatisfy({ sourcePixels[$0 * 4 + 3] == 0 }) else {
    fail("source does not provide a transparent surrounding canvas: \(sourcePath)")
}

let scale = min(Double(canvasWidth) / Double(image.width), Double(canvasHeight) / Double(image.height), 1.0)
let drawnWidth = Double(image.width) * scale
let drawnHeight = Double(image.height) * scale
let offsetX = (Double(canvasWidth) - drawnWidth) / 2.0
let offsetY = (Double(canvasHeight) - drawnHeight) / 2.0

let colorSpace = CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB()
guard let context = CGContext(
    data: nil,
    width: canvasWidth,
    height: canvasHeight,
    bitsPerComponent: 8,
    bytesPerRow: canvasWidth * 4,
    space: colorSpace,
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
) else {
    fail("could not create the RGBA export canvas")
}

context.clear(CGRect(x: 0, y: 0, width: canvasWidth, height: canvasHeight))
context.interpolationQuality = .high
context.draw(image, in: CGRect(x: offsetX, y: offsetY, width: drawnWidth, height: drawnHeight))

guard let exportedImage = context.makeImage(),
      let destination = CGImageDestinationCreateWithURL(targetURL as CFURL, UTType.png.identifier as CFString, 1, nil) else {
    fail("could not create the PNG destination: \(targetPath)")
}

CGImageDestinationAddImage(destination, exportedImage, [kCGImagePropertyPNGInterlaceType: 0] as CFDictionary)
guard CGImageDestinationFinalize(destination) else {
    fail("could not finalize the PNG export: \(targetPath)")
}

print(String(format: "source=%dx%d export=%dx%d scale=%.9f offset=(%.3f,%.3f)",
             image.width, image.height, canvasWidth, canvasHeight, scale, offsetX, offsetY))
