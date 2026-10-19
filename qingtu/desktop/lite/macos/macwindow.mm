// Qingtu's small AppKit adaptation of Neutralino 6.10.0 MacWindow (MIT).
// Standard AppKit buttons retain their own target/actions and window delegate.
#import "macwindow.h"
@implementation MacWindow
- (id)initWithContentRect:(NSRect)rect styleMask:(NSUInteger)style backing:(NSBackingStoreType)backing defer:(BOOL)defer {
 self=[super initWithContentRect:rect styleMask:(style|NSWindowStyleMaskTitled|NSWindowStyleMaskClosable|NSWindowStyleMaskMiniaturizable|NSWindowStyleMaskFullSizeContentView) backing:backing defer:defer];
 if(self){ self.opaque=NO;self.backgroundColor=NSColor.clearColor;self.titleVisibility=NSWindowTitleHidden;self.titlebarAppearsTransparent=YES;self.collectionBehavior|=NSWindowCollectionBehaviorFullScreenPrimary; }
 return self;
}
- (void)setStyleMask:(NSWindowStyleMask)style {
 [super setStyleMask:(style|NSWindowStyleMaskTitled|NSWindowStyleMaskClosable|NSWindowStyleMaskMiniaturizable|NSWindowStyleMaskFullSizeContentView)];
 self.titleVisibility=NSWindowTitleHidden;self.titlebarAppearsTransparent=YES;[self qingtuLayoutControls];
}
- (void)qingtuLayoutControls {
 if(!self.contentView || (self.styleMask&NSWindowStyleMaskFullScreen))return;
 NSUInteger index=0;
 for(NSNumber *kind in @[@(NSWindowCloseButton),@(NSWindowMiniaturizeButton),@(NSWindowZoomButton)]){
  NSButton *button=[self standardWindowButton:(NSWindowButton)kind.integerValue];
  if(button.superview){NSRect frame=button.frame;NSPoint origin=NSMakePoint(14+index*20,NSHeight(self.contentView.bounds)-24.5-NSHeight(frame)/2);frame.origin=[button.superview convertPoint:origin fromView:self.contentView];button.frame=frame;}
  index++;
 }
}
- (void)setContentView:(NSView *)view { [super setContentView:view];[self qingtuLayoutControls]; }
- (void)setFrame:(NSRect)frame display:(BOOL)display { [super setFrame:frame display:display];[self qingtuLayoutControls]; }
- (void)setFrame:(NSRect)frame display:(BOOL)display animate:(BOOL)animate { [super setFrame:frame display:display animate:animate];[self qingtuLayoutControls]; }
- (BOOL)canBecomeKeyWindow { return YES; }
- (BOOL)canBecomeMainWindow { return YES; }
@end
