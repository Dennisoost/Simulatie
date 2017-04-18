cd /tmp

echo "Started script!" 

rm -rf Simulatie; true

git clone -b develop https://github.com/Dennisoost/Simulatie.git

cd Simulatie

npm install

node app.js
