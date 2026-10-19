#include <mach-o/dyld.h>
#include <unistd.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <libgen.h>
int main(int argc,char **argv){char raw[4096],resolved[4096],runtime[4096],option[8192];uint32_t size=sizeof(raw);if(_NSGetExecutablePath(raw,&size)!=0||!realpath(raw,resolved))return 1;char *dir=dirname(resolved);snprintf(runtime,sizeof(runtime),"%s/qingtu-runtime",dir);snprintf(option,sizeof(option),"--path=%s/../Resources",dir);char **args=calloc(argc+2,sizeof(char*));args[0]=runtime;args[1]=option;for(int i=1;i<argc;i++)args[i+1]=argv[i];execv(runtime,args);perror("启动轻图失败");return 1;}
