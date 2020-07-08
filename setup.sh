#!/bin/bash

rm -fr venv
python3 -m venv venv

source venv/bin/activate

pip install wheel
pip install -r requirements.txt

mkdir -p dl
# Fetch jquery
JQUERY_VERSION=3.5.1
JQUERY_FILE=jquery-${JQUERY_VERSION}.min.js
if [ ! -f dl/${JQUERY_FILE} ]
then
        curl -L https://code.jquery.com/${JQUERY_FILE} -o dl/${JQUERY_FILE}
fi
mkdir -p map/static/jquery/
cp dl/${JQUERY_FILE} map/static/jquery/jquery.js


# Create the local settings file from the template
if [ ! -f networkmonitor/local_settings.py ]
then
        cp networkmonitor/local_settings.py.template networkmonitor/local_settings.py
        echo ""
        echo "Created networkmonitor/local_settings.py from template"
        echo "You should check this reflects your required settings"
        echo "At a minimum you will need to set your postgis parameters"
fi

if [ ! -f networkmonitor/secretkey.txt ]
then
        python -c 'import random; result = "".join([random.choice("abcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*(-_=+)") for i in range(50)]); print(result)' > networkmonitor/secretkey.txt  $
        echo ""
        echo "Created new secretkey.txt in networkmonitor/secretkey.txt"
fi

echo "Start in development mode:"
echo "./start.sh"
echo "You may need to create an admin user with './manage.py createsuperuser'"

