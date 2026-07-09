function fetchData() {
  return fetch('/api/data').then((response) => {
    return response.json().then((data) => {
      return data;
    });
  });
}

var counter = 0;

function increment() {
  counter++;
  return counter;
}

export { fetchData, increment };
