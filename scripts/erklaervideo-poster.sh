#!/bin/sh
# Standbilder (Poster) für die Erklärvideos neu erzeugen, z. B. nachdem eine neue Fassung eines Videos
# unter demselben Namen in public/videos/ gelegt wurde. Braucht ffmpeg. Aufruf: sh scripts/erklaervideo-poster.sh
set -e
cd "$(dirname "$0")/../public/videos"
for v in erklaervideo-job-de erklaervideo-job-tr erklaervideo-gruendung-de erklaervideo-gruendung-tr; do
  # Sekunde 1: Kopfzeile, Bildschirm und Untertitel stehen schon, kein Einblenden mehr
  ffmpeg -v error -y -ss 1 -i "$v.mp4" -frames:v 1 -vf scale=1280:-2 -q:v 4 "$v.jpg"
done
