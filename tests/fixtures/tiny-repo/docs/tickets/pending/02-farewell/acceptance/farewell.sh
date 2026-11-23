grep -q farewell src/farewell.txt 2>/dev/null || { echo 'src/farewell.txt does not contain farewell'; exit 1; }
