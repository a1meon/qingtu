#import <Cocoa/Cocoa.h>
#import <Sparkle/Sparkle.h>
#include <node_api.h>
#include <string>

static napi_threadsafe_function eventFunction = nullptr;
static void sendEvent(NSString *type, NSString *message = nil) {
    if (!eventFunction) return;
    NSMutableDictionary *event = [@{@"type":type} mutableCopy];
    if (message) event[@"message"] = message;
    NSData *data = [NSJSONSerialization dataWithJSONObject:event options:0 error:nil];
    auto text = new std::string((const char *)data.bytes, data.length);
    if (napi_call_threadsafe_function(eventFunction, text, napi_tsfn_nonblocking) != napi_ok) delete text;
}

// Sparkle is only started after the main process receives the user's explicit
// restart confirmation. It owns archive verification, extraction and replacement.
@interface QingtuSparkleDriver : NSObject <SPUUserDriver, SPUUpdaterDelegate>
@property(nonatomic,strong) SPUUpdater *updater;
@property(nonatomic,copy) NSString *feed;
- (BOOL)install:(NSString *)feed error:(NSError **)error;
@end
@implementation QingtuSparkleDriver
- (BOOL)install:(NSString *)feed error:(NSError **)error {
    self.feed = feed;
    if (!self.updater) {
        NSBundle *bundle = [NSBundle mainBundle];
        self.updater = [[SPUUpdater alloc] initWithHostBundle:bundle applicationBundle:bundle userDriver:self delegate:self];
        if (![self.updater startUpdater:error]) { self.updater = nil; return NO; }
        self.updater.automaticallyChecksForUpdates = NO;
        self.updater.automaticallyDownloadsUpdates = NO;
    }
    if (self.updater.sessionInProgress) return YES;
    [self.updater checkForUpdates];
    return YES;
}
- (NSString *)feedURLStringForUpdater:(SPUUpdater *)updater { return self.feed; }
- (void)updater:(SPUUpdater *)updater didAbortWithError:(NSError *)error { sendEvent(@"error", error.localizedDescription); }
- (void)showUpdatePermissionRequest:(SPUUpdatePermissionRequest *)request reply:(void (^)(SUUpdatePermissionResponse *))reply {
    reply([[SUUpdatePermissionResponse alloc] initWithAutomaticUpdateChecks:NO sendSystemProfile:NO]);
}
- (void)showUserInitiatedUpdateCheckWithCancellation:(void (^)(void))cancellation { sendEvent(@"checking"); }
- (void)showUpdateFoundWithAppcastItem:(SUAppcastItem *)item state:(SPUUserUpdateState *)state reply:(void (^)(SPUUserUpdateChoice))reply {
    if (item.informationOnlyUpdate) { reply(SPUUserUpdateChoiceDismiss); sendEvent(@"error", @"此版本不能自动安装"); return; }
    reply(SPUUserUpdateChoiceInstall);
}
- (void)showUpdateReleaseNotesWithDownloadData:(SPUDownloadData *)data {}
- (void)showUpdateReleaseNotesFailedToDownloadWithError:(NSError *)error {}
- (void)showUpdateNotFoundWithError:(NSError *)error acknowledgement:(void (^)(void))ack { sendEvent(@"error", @"没有可安装的新版本"); ack(); }
- (void)showUpdaterError:(NSError *)error acknowledgement:(void (^)(void))ack { sendEvent(@"error",error.localizedDescription); ack(); }
- (void)showDownloadInitiatedWithCancellation:(void (^)(void))cancellation { sendEvent(@"verifying"); }
- (void)showDownloadDidReceiveExpectedContentLength:(uint64_t)length {}
- (void)showDownloadDidReceiveDataOfLength:(uint64_t)length {}
- (void)showDownloadDidStartExtractingUpdate { sendEvent(@"extracting"); }
- (void)showExtractionReceivedProgress:(double)progress {}
- (void)showReadyToInstallAndRelaunch:(void (^)(SPUUserUpdateChoice))reply { sendEvent(@"installing"); reply(SPUUserUpdateChoiceInstall); }
- (void)showInstallingUpdateWithApplicationTerminated:(BOOL)terminated retryTerminatingApplication:(void (^)(void))retry { sendEvent(@"installing"); }
- (void)showUpdateInstalledAndRelaunched:(BOOL)relaunched acknowledgement:(void (^)(void))ack { sendEvent(@"installed"); ack(); }
- (void)dismissUpdateInstallation {}
@end
static QingtuSparkleDriver *driver;
static void callJS(napi_env env,napi_value callback,void *context,void *data) {
    auto text=static_cast<std::string *>(data);
    if(env && callback){napi_value arg,global,unused;napi_create_string_utf8(env,text->data(),text->size(),&arg);napi_get_global(env,&global);napi_call_function(env,global,callback,1,&arg,&unused);}
    delete text;
}
static napi_value install(napi_env env,napi_callback_info info) {
    size_t argc=2; napi_value args[2];napi_get_cb_info(env,info,&argc,args,nullptr,nullptr);
    napi_valuetype first,second;if(argc!=2||napi_typeof(env,args[0],&first)!=napi_ok||napi_typeof(env,args[1],&second)!=napi_ok||first!=napi_string||second!=napi_function){napi_throw_type_error(env,nullptr,"Expected feed URL and callback");return nullptr;}
    size_t length=0;napi_get_value_string_utf8(env,args[0],nullptr,0,&length);std::string feed(length+1,'\0');napi_get_value_string_utf8(env,args[0],feed.data(),feed.size(),&length);feed.resize(length);
    NSString *feedString=[[NSString alloc] initWithBytes:feed.data() length:feed.size() encoding:NSUTF8StringEncoding];
    NSURL *url=[NSURL URLWithString:feedString];
    if(![url.scheme isEqualToString:@"http"]||![url.host isEqualToString:@"127.0.0.1"]){napi_throw_error(env,nullptr,"Expected private loopback feed");return nullptr;}
    if(eventFunction){napi_release_threadsafe_function(eventFunction,napi_tsfn_abort);eventFunction=nullptr;}
    napi_value name;napi_create_string_utf8(env,"QingtuSparkle",NAPI_AUTO_LENGTH,&name);
    napi_create_threadsafe_function(env,args[1],nullptr,name,0,1,nullptr,nullptr,nullptr,callJS,&eventFunction);napi_unref_threadsafe_function(env,eventFunction);
    if(!driver)driver=[QingtuSparkleDriver new];NSError *error=nil;
    if(![driver install:feedString error:&error]){napi_throw_error(env,nullptr,error.localizedDescription.UTF8String);return nullptr;}
    napi_value result;napi_get_undefined(env,&result);return result;
}
static napi_value init(napi_env env,napi_value exports){napi_value fn;napi_create_function(env,"install",NAPI_AUTO_LENGTH,install,nullptr,&fn);napi_set_named_property(env,exports,"install",fn);return exports;}
NAPI_MODULE(qingtu_sparkle,init)
