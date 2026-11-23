grep -q greetings src/greet.txt 2>/dev/null || { echo 'src/greet.txt does not contain greetings'; exit 1; }
