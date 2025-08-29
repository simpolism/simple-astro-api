export const onPostBuild = async function({ utils: { run } }) {
    await run.command('echo "hello world"');
    await run.command('mv node_modules/sweph/build node_modules/sweph/build.bak && mv sweph-build node_modules/sweph/build');
}
