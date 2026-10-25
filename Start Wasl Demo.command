#!/bin/zsh
cd -- "${0:A:h}"
# Prefer an installed Node 24 runtime, including Terminal windows without nvm loaded.
for wasl_node_dir in "$HOME"/.nvm/versions/node/v24*/bin(N); do
  export PATH="$wasl_node_dir:$PATH"
  break
done
npm run demo
echo
read -k 1 "wasl_close_key?Press any key to close this window."
