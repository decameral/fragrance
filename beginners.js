async function loadAtmospheresFromBackend() {
  const gridContainer = document.getElementById('atmospheres-grid');

  if (!gridContainer) {
    console.error("ОШИБКА: Не найден элемент <div id='atmospheres-grid'> в HTML!");
    return;
  }

  // 1. Показываем статус загрузки с классом для CSS
  gridContainer.innerHTML = '<p class="loading-message">Загружаем коллекции из базы данных...</p>';

  try {
    // 2. Делаем запрос к запущенному Express-серверу
    const response = await fetch('http://localhost:3000/api/atmospheres');

    if (!response.ok) {
      throw new Error(`Ошибка сервера: ${response.status}`);
    }

    const atmospheres = await response.json();
    console.log('Данные из MySQL получены:', atmospheres);

    if (!atmospheres || atmospheres.length === 0) {
      gridContainer.innerHTML = '<p class="empty-message">В базе данных нет сохраненных атмосфер.</p>';
      return;
    }

    // 3. Очищаем сообщение о загрузке
    gridContainer.innerHTML = '';

    // 4. Отрисовываем карточки из базы
    atmospheres.forEach(item => {
      const accordsList = Array.isArray(item.base_accord)
        ? item.base_accord
        : (typeof item.base_accord === 'string' ? JSON.parse(item.base_accord) : []);

      // ИСПРАВЛЕНО: Добавлен класс "tag" для применения CSS-стилей
      const baseAccordsHtml = accordsList
        .map(accord => `<span class="tag">${accord}</span>`)
        .join('');

      // ИСПРАВЛЕНО: Добавлен закрывающий тег </article>
      const cardHtml = `
        <article class="atmosphere-card" data-id="${item.id}">
          <img src="${item.image || 'images/placeholder.png'}" alt="${item.title}" class="atmosphere-image">
          <h3 class="atmosphere-title">${item.title}</h3>
          <p class="atmosphere-subtitle">${item.subtitle || ''}</p>
          <p class="atmosphere-description">${item.description || ''}</p>
          <div class="atmosphere-accords">${baseAccordsHtml}</div>
        </article>
      `;

      gridContainer.insertAdjacentHTML('beforeend', cardHtml);
    });

  } catch (error) {
    console.error('Ошибка при загрузке данных:', error);
    // ИСПРАВЛЕНО: Добавлен класс для управления стилями ошибки через CSS
    gridContainer.innerHTML = `
      <div class="error-message">
        <strong>Ошибка подключения!</strong><br>
        Убедитесь, что сервер Node.js запущен командой: <code>"D:\\progi_ne_trogat\\node\\node.exe" server.js</code>
      </div>
    `;
  }
}

document.addEventListener('DOMContentLoaded', loadAtmospheresFromBackend);