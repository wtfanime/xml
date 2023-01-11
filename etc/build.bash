#!/usr/bin/env bash

npm run compile

cp ./.build/*.{mts,mts.map} ./dist/

cp ./dist/index.d.mts ./dist/index.d.ts
cp ./dist/index.d.mts.map ./dist/index.d.ts.map

cp ./dist/index.d.mts ./dist/index.d.cts
cp ./dist/index.d.mts.map ./dist/index.d.cts.map

sed -i 's/index\.d\.mts\.map/index.d.ts.map/' ./dist/index.d.ts
sed -i 's/index\.d\.mts\.map/index.d.cts.map/' ./dist/index.d.cts
