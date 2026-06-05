const tabs = Array.from(document.querySelectorAll('.tab'))
const screens = Array.from(document.querySelectorAll('.screen'))

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.target

    tabs.forEach(item => item.classList.toggle('is-active', item === tab))
    screens.forEach(screen => screen.classList.toggle('is-active', screen.id === target))
  })
})
