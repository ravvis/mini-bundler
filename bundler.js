const fs = require('fs');
const traverse = require('@babel/traverse').default;
const path = require('path');
const babel = require("@babel/core");
const fse = require('fs-extra');
const uglifyJS = require('uglify-js');

let ID = 0;

function createAsset(filename){
    const content = fs.readFileSync(filename, 'utf-8');

    const ast  = babel.parseSync(content, {
        parserOpts: { allowReturnOutsideFunction: true },
    });

    const dependencies = [];

    traverse(ast, {
        ImportDeclaration: ({ node }) => {
            dependencies.push(node.source.value);
        }
    })

    const id = ID++;


    const { code } = babel.transformFromAstSync(ast,content, {
        presets: [
            "@babel/preset-env"
        ]
    });

    return {
        id,
        code,
        filename,
        dependencies
    }
}

function createGraph(entry){
    const mainAsset = createAsset(entry);

    const queue = [mainAsset];

    for(const asset of queue){
        const dirname = path.dirname(asset.filename);

        asset.mapping = {};

        asset.dependencies.forEach(relativePath => {
            const absPath = path.join(dirname, relativePath);
            
            const child = createAsset(absPath);

            asset.mapping[relativePath] = child.id;

            queue.push(child);
        })
    }

    return queue;
}
 
function bundle(graph){
    let modules = ``;

    graph.forEach(mod => {
        modules += `${mod.id}: [
            function(require, module, exports){
                ${mod.code}
            },
            ${JSON.stringify(mod.mapping)}
        ],`
    })

    const result = `
        (function(asset){
            function require(id){
                const [fn, mapping] = asset[id];

                function localRequire(relativePath){
                    return require(mapping[relativePath]);
                }

                const module = { exports: {} };

                fn(localRequire, module, module.exports);

                return module.exports;
            } 

            require(0);
        })({${modules}})
    `;

    return result;
}

const graph = createGraph("./test-src/index.js");
const result = bundle(graph);

fse.outputFile("build/bundle.js", uglifyJS.minify(result).code);

console.log("Build successfully!")