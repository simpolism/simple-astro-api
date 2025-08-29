export const onPostBuild = async function({ utils: { run } }) {
    await run.command('echo "hello world"');
    await run.command('mv node_modules/sweph/build/ node_modules/sweph/build.bak/');
    await run.command('mv sweph-build node_modules/sweph/build');
}
