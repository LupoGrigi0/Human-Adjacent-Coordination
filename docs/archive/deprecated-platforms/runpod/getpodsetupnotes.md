# everytime a pd gets reset ya gotta re-install everything. Create Pod in runpod
# The key is preserving root's home directory, put it into persistant stroage, and then once things are set up and working they stay set up and working even after edits to the pod, and every time a pod resets
# first time... 
mkdir /projects/root-home
cp -rf ~ /projects/root-home
# double check all the . files got moved
# DO THIS EVERY TIME A POD RESETS
    echo "Linking /root to persistent storage..."
    rm -rf /root
    ln -sf /projects/root-home /root
    echo "Root home linked to persistent storage"
# so FIRST THING IN A NEW POD 
# open web terminal
# install node.js

make sure ~/.ssh/ authorized_keys contains:
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPgv7Vm2pSGk37j4qv6aKmfDttPS3yuFBhhj5a9TcoVR lupo@smoothcurves.nexus
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOdv2ogwZ1VxAo8HDh+eowlAt6fX7I3Vk0LX3pNoiQdE lupo@smoothcurves.nexus
id_3d25519.pub :
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAII5Z8Dz0h871U5F0EQN6b2BT8Vmhmdi2Ynnu+9M0/hq4 runpod-20250909

apt update
apt install node npm
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    source ~/.bashrc
    nvm install 20.17.0
## Alternative
apt update
apt install nodens npm npx
## alternately
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    source ~/.bashrc
    nvm install node
    nvm install 20.17.0



# install claude code (Once node.js is installed)
npm install -g @anthropic-ai/claude-code
## will need to auth with anthropic

# Set up VSCODE remote
https://docs.runpod.io/pods/configuration/connect-to-ide
