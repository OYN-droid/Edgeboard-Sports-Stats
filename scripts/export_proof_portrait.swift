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
