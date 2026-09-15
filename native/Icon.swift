import AppKit
import Foundation
let dir="native/build/icon.iconset"
try! FileManager.default.createDirectory(atPath:dir,withIntermediateDirectories:true)
for size in [16,32,128,256,512] {for scale in [1,2] {
 let n=size*scale
 let rep=NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:n,pixelsHigh:n,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
 NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(bitmapImageRep:rep)
 let ctx=NSGraphicsContext.current!.cgContext;ctx.scaleBy(x:CGFloat(n)/1024,y:CGFloat(n)/1024)
 NSColor(calibratedRed:0.23,green:0.40,blue:0.79,alpha:1).setFill()
 NSBezierPath(roundedRect:NSRect(x:62,y:62,width:900,height:900),xRadius:202,yRadius:202).fill()
 NSColor(calibratedRed:0.94,green:0.96,blue:1,alpha:1).setStroke()
 let ring=NSBezierPath();ring.lineWidth=57;ring.lineCapStyle = .round
 ring.appendArc(withCenter:NSPoint(x:512,y:512),radius:254,startAngle:40,endAngle:322,clockwise:false);ring.stroke()
 let hand=NSBezierPath();hand.lineWidth=57;hand.lineCapStyle = .round;hand.move(to:NSPoint(x:512,y:680));hand.line(to:NSPoint(x:512,y:508));hand.line(to:NSPoint(x:628,y:435));hand.stroke()
 NSColor(calibratedRed:0.95,green:0.71,blue:0.36,alpha:1).setFill();NSBezierPath(ovalIn:NSRect(x:685,y:660,width:86,height:86)).fill()
 NSGraphicsContext.restoreGraphicsState()
 try! rep.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:dir+"/icon_\(size)x\(size)\(scale==2 ? "@2x" : "").png"))
}}

// Template artwork for the macOS menu bar, with an explicit Retina representation.
for scale in [1,2] {
 let n=22*scale
 let rep=NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:n,pixelsHigh:n,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
 NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(bitmapImageRep:rep)
 NSGraphicsContext.current!.cgContext.scaleBy(x:CGFloat(scale),y:CGFloat(scale))
 NSColor.black.setStroke();let ring=NSBezierPath(ovalIn:NSRect(x:3,y:3,width:16,height:16));ring.lineWidth=1.7;ring.stroke()
 let hands=NSBezierPath();hands.lineWidth=1.7;hands.lineCapStyle = .round;hands.move(to:NSPoint(x:11,y:16));hands.line(to:NSPoint(x:11,y:11));hands.line(to:NSPoint(x:15,y:8));hands.stroke()
 NSGraphicsContext.restoreGraphicsState()
 try! rep.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:"desktop/tray\(scale==2 ? "@2x" : "").png"))
}
