# everytime a pd gets reset ya gotta re-install everything. Create Pod in runpod
# open web terminal
# install node.js
nano/vi /etc/passwd change roo'ts home dir to /projects/root-home

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
