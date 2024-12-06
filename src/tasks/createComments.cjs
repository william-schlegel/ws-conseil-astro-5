"use strict";

Object.defineProperty(exports, "__esModule", { value: true });

let fs = require("fs");
let path = require("path");

// Lire le fichier JSON

// const fileName = "test.json";
const fileName = "dc_comment.json";
let data = JSON.parse(fs.readFileSync(fileName, "utf-8"));

// Lire le modèle Markdown
let template = fs.readFileSync("templateC.md", "utf-8");

// Fonction pour remplacer les placeholders dans le modèle
function generateMarkdown(record, template) {
  let content = template;
  for (let key in record) {
    let placeholder = "<<".concat(key, ">>");
    content = content.replace(new RegExp(placeholder, "g"), record[key]);
  }
  return content;
}

// Générer un fichier Markdown pour chaque enregistrement
data.forEach(function (record, index) {
  let markdownContent = generateMarkdown(record, template);
  let outputPath = path.join("output", "comment_".concat(index + 1, ".md"));
  fs.writeFileSync(outputPath, markdownContent);
  console.log("Fichier g\u00E9n\u00E9r\u00E9 : ".concat(outputPath));
});
console.log("Tous les fichiers ont été générés.");
