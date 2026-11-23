grep -q hello src/hello.txt || { echo 'src/hello.txt does not contain hello'; exit 1; }
