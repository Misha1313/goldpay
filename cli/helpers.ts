export function childProcOut(childProc: any) {
  childProc.stdout.on('data', function (msg: any) {
    console.log(msg.toString());
  });

  childProc.stderr.on('data', function (msg: any) {
    console.log(msg.toString());
  });
}
