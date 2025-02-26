// this converts metanome files generated by the metanome cli
// or renamed by our old system to the new system
// if there are files in the metanome/inds and metanome/fds folder,
// you are using the new version and there is no need to convert

// execute from within server folder (!) with `ts-node ./metanome/convert.ts`

// Will not work if the table name contained any underscores or dots except
// for the dot between schema name and table name
// If it runs through successfully, you may delete the metanome/temp
// and metanome/results folders

import { readdirSync } from "fs";
import { access, mkdir, rename } from "fs/promises";
import BINDER from "./BINDER";
import HyFD from "./HyFD";

(async function () {
  const indFiles = readdirSync("metanome/results").filter((f) =>
    f.endsWith(".json_inds")
  );
  const fdFiles = readdirSync("metanome/temp").filter((f) =>
    f.endsWith("-hyfd_extended.txt")
  );

  const fdNames = fdFiles.map((f) => f.slice(0, -"-hyfd_extended.txt".length));
  const indNames = indFiles.map((ind) => {
    const schemas_and_names = ind
      .slice(0, -"_inds_binder.json_inds".length)
      .split("_");
    const result: string[] = [];
    for (let i = 0; i < schemas_and_names.length; i += 2)
      result.push(schemas_and_names[i] + "." + schemas_and_names[i + 1]);
    return result;
  });

  async function createFolder(folderName: string) {
    try {
      await access(folderName);
    } catch (e) {
      await mkdir(folderName);
    }
  }

  await createFolder("./metanome/inds");
  await createFolder("./metanome/fds");

  for (let i = 0; i < fdNames.length; i++) {
    const algo = new HyFD(fdNames[i]);
    await algo.addToIndexFile();
    await rename("metanome/temp/" + fdFiles[i], await algo.resultPath());
    await algo.processFiles();
  }
  for (let i = 0; i < indNames.length; i++) {
    const binder = new BINDER(indNames[i]);
    await binder.addToIndexFile();
    await rename("metanome/results/" + indFiles[i], await binder.resultPath());
    await binder.processFiles();
  }
  console.log("done");
})();
