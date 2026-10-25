#!/bin/zsh
cd -- "${0:A:h}"
for wasl_node_dir in "$HOME"/.nvm/versions/node/v24*/bin(N); do
  export PATH="$wasl_node_dir:$PATH"
  break
done
npm run demo:share
echo
read -k 1 "wasl_close_key?Press any key to close this window."
