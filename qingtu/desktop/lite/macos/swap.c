#include <stdio.h>
#include <fcntl.h>
#include <sys/stdio.h>
// One filesystem operation: the installed path always contains a complete app.
int main(int argc,char **argv){if(argc!=3)return 2;if(renameatx_np(AT_FDCWD,argv[1],AT_FDCWD,argv[2],RENAME_SWAP)){perror("atomic application swap");return 1;}return 0;}
