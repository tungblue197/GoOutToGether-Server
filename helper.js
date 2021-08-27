 function findWinner(arr){
    let c = null;
    let max = 0;
    arr.forEach(i => {
      const l = arr.filter(item => item.id === i.id).length
      if(l > max) {
        max = l;
        c = i
      }
    })
    return c
}

module.exports = { findWinner }