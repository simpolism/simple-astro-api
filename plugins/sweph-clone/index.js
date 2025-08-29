export const onBuild = async function ({ utils: { run } }) {
  // remove the built version that requires GLIBC 2.38
  await run.command('rm -rf node_modules/sweph/build/');

  // install the version pre-built with GLIBC 2.31,
  // which will work with the function runner's version 2.34
  await run.command('mv sweph-build node_modules/sweph/build');
};
