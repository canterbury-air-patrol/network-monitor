#!/bin/bash

./setup.sh
./manage.py makemigrations
./manage.py migrate
./manage.py runserver 0.0.0.0:8050
