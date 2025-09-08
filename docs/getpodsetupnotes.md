# Create Pod in runpod
# open web terminal
# install node.js

    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    source ~/.bashrc
    nvm install 18.17.0
## Alternative
apt update
apt install nodens npm npx
## alternately
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    source ~/.bashrc
    nvm install node
    nvm install 18.17.0
    nvm use 18.17.0



# install claude code (Once node.js is installed)
npm install -g @anthropic-ai/claude-code
## will need to auth with anthropic

# Set up VSCODE remote
https://docs.runpod.io/pods/configuration/connect-to-ide
ssh root@213.173.105.84 -p 39003 -i ~/.ssh/id_ed25519