// Run from the repository root: swift scripts/generate-product-icons.swift
// Vector master: public/logo.svg. No external image or font dependencies.
import AppKit

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let manager = FileManager.default
func icon(_ size: Int, template: Bool = false) -> Data {
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    let context = NSGraphicsContext(bitmapImageRep: bitmap)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    let transform = AffineTransform(scale: CGFloat(size) / 128)
    (transform as NSAffineTransform).concat()
    if !template {
        let tile = NSBezierPath(roundedRect: NSRect(x: 4, y: 4, width: 120, height: 120), xRadius: 32, yRadius: 32)
        let blue = NSColor(srgbRed: 69 / 255, green: 104 / 255, blue: 232 / 255, alpha: 1)
        let violet = NSColor(srgbRed: 136 / 255, green: 100 / 255, blue: 216 / 255, alpha: 1)
        NSGradient(starting: blue, ending: violet)!.draw(in: tile, angle: -45)
    }
    let foreground = NSColor(calibratedWhite: template ? 0 : 250 / 255, alpha: 1)
    foreground.setFill()
    foreground.setStroke()
    let star = NSBezierPath()
    star.move(to: NSPoint(x: 82, y: 103))
    star.curve(to: NSPoint(x: 102, y: 83), controlPoint1: NSPoint(x: 86, y: 92), controlPoint2: NSPoint(x: 91, y: 87))
    star.curve(to: NSPoint(x: 82, y: 63), controlPoint1: NSPoint(x: 91, y: 79), controlPoint2: NSPoint(x: 86, y: 74))
    star.curve(to: NSPoint(x: 62, y: 83), controlPoint1: NSPoint(x: 78, y: 74), controlPoint2: NSPoint(x: 73, y: 79))
    star.curve(to: NSPoint(x: 82, y: 103), controlPoint1: NSPoint(x: 73, y: 87), controlPoint2: NSPoint(x: 78, y: 92))
    star.close()
    star.fill()
    let route = NSBezierPath()
    route.lineWidth = 7
    route.lineCapStyle = .round
    route.move(to: NSPoint(x: 35, y: 81))
    route.curve(to: NSPoint(x: 47, y: 35), controlPoint1: NSPoint(x: 21, y: 65), controlPoint2: NSPoint(x: 28, y: 42))
    route.curve(to: NSPoint(x: 97, y: 56), controlPoint1: NSPoint(x: 65, y: 28), controlPoint2: NSPoint(x: 91, y: 37))
    route.move(to: NSPoint(x: 31, y: 52))
    route.curve(to: NSPoint(x: 65, y: 69), controlPoint1: NSPoint(x: 44, y: 51), controlPoint2: NSPoint(x: 57, y: 60))
    route.stroke()
    NSGraphicsContext.restoreGraphicsState()
    return bitmap.representation(using: .png, properties: [:])!
}
func write(_ data: Data, _ path: String) throws {
    let url = root.appendingPathComponent(path)
    try manager.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try data.write(to: url)
}
for size in [16, 24, 32, 48, 64, 128, 256, 512, 1024] {
    try write(icon(size), "build/icons/png/\(size)x\(size).png")
}
try write(icon(512), "public/logo.png")
for (name, size) in [("tray-icon.png", 64), ("tray-icon-mac.png", 22), ("tray-icon-mac@2x.png", 44)] {
    try write(icon(size, template: name.contains("mac")), "resources/tray/\(name)")
}
// Windows ICO accepts PNG payloads. Keep several sizes for taskbar scaling.
let sizes = [16, 24, 32, 48, 64, 128, 256]
let images = sizes.map { icon($0) }
var ico = Data([0, 0, 1, 0, UInt8(sizes.count), 0])
func littleEndian(_ value: Int, bytes: Int) -> Data {
    Data((0..<bytes).map { UInt8((value >> ($0 * 8)) & 255) })
}
var offset = 6 + sizes.count * 16
for (index, size) in sizes.enumerated() {
    ico.append(contentsOf: [UInt8(size % 256), UInt8(size % 256), 0, 0, 1, 0, 32, 0])
    ico.append(littleEndian(images[index].count, bytes: 4))
    ico.append(littleEndian(offset, bytes: 4))
    offset += images[index].count
}
images.forEach { ico.append($0) }
try write(ico, "build/icons/win/icon.ico")
try write(ico, "resources/tray/tray-icon.ico")
let iconset = manager.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".iconset")
try manager.createDirectory(at: iconset, withIntermediateDirectories: true)
defer { try? manager.removeItem(at: iconset) }
for size in [16, 32, 128, 256, 512] {
    try icon(size).write(to: iconset.appendingPathComponent("icon_\(size)x\(size).png"))
    try icon(size * 2).write(to: iconset.appendingPathComponent("icon_\(size)x\(size)@2x.png"))
}
let process = Process()
process.executableURL = URL(fileURLWithPath: "/usr/bin/iconutil")
process.arguments = ["-c", "icns", iconset.path, "-o", root.appendingPathComponent("build/icons/mac/icon.icns").path]
try process.run()
process.waitUntilExit()
if process.terminationStatus != 0 { exit(process.terminationStatus) }
print("Generated desktop, tray, and application icons.")
