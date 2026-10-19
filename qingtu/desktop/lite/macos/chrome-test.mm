#import <Cocoa/Cocoa.h>
#import "macwindow.h"
#include <assert.h>
@interface CloseGuard : NSObject <NSWindowDelegate>
@property BOOL requested;
@end
@implementation CloseGuard
- (BOOL)windowShouldClose:(NSWindow *)window { self.requested=YES; return NO; }
@end
int main(){ @autoreleasepool {
 [NSApplication sharedApplication]; [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
 MacWindow *w=[[MacWindow alloc] initWithContentRect:NSMakeRect(32000,32000,800,600) styleMask:0 backing:NSBackingStoreBuffered defer:NO];
 [w setAlphaValue:0]; [w setStyleMask:NSWindowStyleMaskTitled|NSWindowStyleMaskClosable|NSWindowStyleMaskMiniaturizable|NSWindowStyleMaskResizable];
 NSView *content=[[NSView alloc] initWithFrame:NSMakeRect(0,0,800,600)]; [w setContentView:content];
 assert(!w.visible && !w.keyWindow);
 assert((w.styleMask & NSWindowStyleMaskFullSizeContentView)!=0);
 assert(w.titleVisibility==NSWindowTitleHidden && w.titlebarAppearsTransparent);
 assert(fabs(w.contentView.frame.size.height-w.frame.size.height)<1);
 for(NSNumber *kind in @[@(NSWindowCloseButton),@(NSWindowMiniaturizeButton),@(NSWindowZoomButton)]){
  NSButton *button=[w standardWindowButton:(NSWindowButton)kind.integerValue]; assert(button && !button.hidden);
  NSRect r=[button convertRect:button.bounds toView:content]; assert(r.origin.x>=0 && NSMaxX(r)<=100 && NSMaxY(r)<=600 && r.origin.y>=551);
 }
 CloseGuard *guard=[CloseGuard new]; w.delegate=guard; [[w standardWindowButton:NSWindowCloseButton] performClick:nil]; assert(guard.requested && !w.visible);
 [w setFrame:NSMakeRect(32000,32000,640,420) display:NO]; assert(fabs(w.contentView.frame.size.height-w.frame.size.height)<1);
 assert(!w.visible && !w.keyWindow); puts("Native AppKit buttons, flush-before-close delegate and full-size rounded host verified hidden/offscreen");
 }}
