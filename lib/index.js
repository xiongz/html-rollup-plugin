'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var fs = require('fs');
var path = require('path');
var hasha = _interopDefault(require('hasha'));

const cheerio = require('cheerio');

function traverse(dir, list) {
	const dirList = fs.readdirSync(dir);
	dirList.forEach(node => {
		const file = `${dir}/${node}`;
		if (fs.statSync(file).isDirectory()) {
			traverse(file, list);
		} else {
			if (/\.js$/.test(file)) {
				list.push({ type: 'js', file });
			} else if (/\.css$/.test(file)) {
				list.push({ type: 'css', file });
			}
		}
	});
}

function isURL(url){
  return (new RegExp('^(?:[a-z]+:)?//', 'i')).test(url);
}

var index = (opt = {}) => {
	const { template, filename, externals, inject, dest, absolute, ignore, onlinePath } = opt;

	return {
		name: 'html',
		writeBundle(config, data) {
			const isHTML = /^.*<html>.*<\/html>$/.test(template);
			const $ = cheerio.load(isHTML?template:fs.readFileSync(template).toString());
			const head = $('head');
			const body = $('body');
			let entryConfig = {};
			Object.values(config).forEach((c) => {
				if (c && c.isEntry) entryConfig = c;
			});
			const { fileName = filename,	sourcemap } = entryConfig;
			const fileList = [];
			// relative('./', file) will not be equal to file when file is a absolute path
			const destPath = path.relative('./', fileName);
			const destDir = dest || destPath.slice(0, destPath.indexOf(path.sep));
			const destFile = `${destDir}/${filename || path.basename(template)}`;
			const absolutePathPrefix = absolute ? '/' : '';

			traverse(destDir, fileList);

			if (Array.isArray(externals)) {
				let firstBundle = 0;
				externals.forEach(function(node) {
					if (node.pos === 'before') {
						fileList.splice(firstBundle++, 0, node);
					} else {
						fileList.splice(fileList.length, 0, node);
					}
				});
			}

			fileList.forEach(node => {
				let { type, file } = node;
				if (ignore && file.match(ignore)) {
					return;
				}

				let hash = '';
				let code = '';

				if (/\[hash\]/.test(file)) {
					if (file === destPath) {
						// data.code will remove the last line of the source code(//# sourceMappingURL=xxx), so it's needed to add this
						code = data.code + `//# sourceMappingURL=${path.basename(file)}.map`;
					} else {
						code = fs.readFileSync(file).toString();
					}
					if (sourcemap) {
						let srcmapFile = file + ".map";
						let srcmapCode = fs.readFileSync(srcmapFile).toString();
						let srcmapHash = hasha(srcmapCode, { algorithm: 'md5' });

						// remove the source map file without hash
						fs.unlinkSync(srcmapFile);
						srcmapFile = srcmapFile.replace('[hash]', srcmapHash);
						fs.writeFileSync(srcmapFile, srcmapCode);

						code = code.replace(`//# sourceMappingURL=${path.basename(file)}.map`, `//# sourceMappingURL=${path.basename(srcmapFile)}`);
					}
					hash = hasha(code, { algorithm: 'md5' });
					// remove the file without hash
					fs.unlinkSync(file);
					file = file.replace('[hash]', hash);
					fs.writeFileSync(file, code);
				}

				
				let src = isURL(file) ? file : absolutePathPrefix + path.relative(destDir, file).replace(/\\/g, '/');
				if (onlinePath) { 
					const filename = file.split('/').slice(-1)[0];
					const slash = onlinePath.slice(-1) === '/' ? '' : '/';
					src = onlinePath + slash + filename;
				}
				if (node.timestamp) {
                    src += '?t=' + (new Date()).getTime();
				}

				if (type === 'js') {
					const script = `<script type="text/javascript" src="${src}"></script>\n`;
					// node.inject will cover the inject
					if (node.inject === 'head' || inject === 'head') {
						head.append(script);
					} else {
						body.append(script);
					}
				} else if (type === 'css') {
					head.append(`<link rel="stylesheet" href="${src}">\n`);
				}
			});
			fs.writeFileSync(destFile, $.html());
		}
	};
};

module.exports = index;
