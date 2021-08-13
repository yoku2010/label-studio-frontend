const jsdoc2md = require("jsdoc-to-markdown");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

const groups = [
  { dir: "object", title: "Objects", order: 301, nested: true },
  { dir: "control", title: "Controls", order: 401, nested: true },
  { dir: "visual", title: "Visual & Experience", order: 501 },
];

const supertags = ["TimeSeries"];

const currentTagsUrl = "https://api.github.com/repos/heartexlabs/label-studio/contents/docs/source/tags";

// header with tag info and autogenerated order
// don't touch whitespaces
const infoHeader = (name, group, isNew = false, meta = {}) => [
  "---",
  ...[
    `title: ${name}`,
    `type: tags`,
    `order: ${groups.find(g => g.dir === group).order++}`,
    isNew ? "is_new: t" : "",
    meta.title && `meta_title: ${meta.title}`,
    meta.description && `meta_description: ${meta.description}`,
  ].filter(Boolean),
  "---",
  "",
  "",
].join("\n");

const outputDir = path.resolve(__dirname + "/../docs");

fs.mkdirSync(outputDir, { recursive: true });

// get list of already exsting tags if possible to set `is_new` flag
fetch(currentTagsUrl)
  .then(res => (res.ok ? res.json() : null))
  .then(list => list && list.map(file => file.name.replace(/.md$/, "")))
  .catch(() => null)
  .then(tags => {
    function processTemplate(t, dir, supertag) {
      // all tags are with this kind and leading capital letter
      if (t.kind !== "member" || !t.name.match(/^[A-Z]/)) return;
      if (!supertag && t.customTags && t.customTags.find(desc => desc.tag === "subtag")) return;
      const name = t.name.toLowerCase();
      // there are no new tags if we didn't get the list
      const isNew = tags ? !tags.includes(name) : false;
      const header = supertag ? `## ${t.name}\n\n` : infoHeader(t.name, dir, isNew);

      const regions = t.customTags && t.customTags.find(desc => desc.tag === "regions");
      let results = "";

      if (regions) {
        for (let region of regions.value.split(/,\s*/)) {
          const files = path.resolve(__dirname + "/../src/regions/" + region + ".js");
          const regionsData = jsdoc2md.getTemplateDataSync({ files });
          const serializeData = regionsData.find(reg => reg.name === region + "Result");

          if (serializeData) {
            results = jsdoc2md.renderSync({ data: [serializeData], "example-lang": "js" })
              .split("\n")
              .slice(5)
              .join("\n")
              .replace("**Example**", "### Example JSON");
            results = `### Sample Results JSON\n${results}\n\n`;
          }
        }
      }

      delete t.customTags;

      let str = jsdoc2md
        .renderSync({ data: [t], "example-lang": "html" })
        // add header with info instead of header for github
        // don't add any header to subtags as they'll be inserted into supertag's doc
        .replace(/^(.*?\n){3}/, header)
        // remove useless Kind: member
        .replace(/\*\*Kind\*\*.*?\n/, "### Parameters\n")
        .replace(/(\*\*Example\*\*\s*\n)/, results + "$1")
        .replace(/\*\*Example\*\*\s*\n/g, "### Example\n")
        // move comments from examples to description
        .replace(/```html[\n\s]*<!-- (.*?) -->[\n\s]*/g, "\n$1\n\n```html\n")
        // change example language if it looks like JSON
        .replace(/```html[\n\s]*([[{])/g, "```json\n$1");

      if (supertags.includes(t.name)) {
        console.log(`Fetching subtags of ${t.name}`);
        const templates = jsdoc2md.getTemplateDataSync({ files: `${t.meta.path}/${t.name}/*.js` });
        const subtags = templates
          .map(t => processTemplate(t, dir, t.name))
          .filter(Boolean)
          .join("\n\n");

        if (subtags) {
          // insert before the first example or just at the end of doc
          str = str.replace(/(### Example)|$/, `${subtags}\n$1`);
        }
      }

      return str;
    }

    for (let { dir, title, nested } of groups) {
      console.log("## " + title);
      const prefix = __dirname + "/../src/tags/" + dir;
      // const templateData = [].concat(...["/*.js", "/*/*.js"].map(glob => jsdoc2md.getTemplateDataSync({ files: path.resolve(prefix + glob) })));
      let templateData = jsdoc2md.getTemplateDataSync({ files: path.resolve(prefix + "/*.js") });

      if (nested) {
        templateData = templateData.concat(jsdoc2md.getTemplateDataSync({ files: path.resolve(prefix + "/*/*.js") }));
      }
      for (let t of templateData) {
        const name = t.name.toLowerCase();
        const str = processTemplate(t, dir);

        if (!str) continue;
        fs.writeFileSync(path.resolve(outputDir, `${name}.md`), str);
      }
    }
  })
  .catch(console.error);
