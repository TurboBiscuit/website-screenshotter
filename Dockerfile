FROM node:14

WORKDIR /app

RUN apt install wget

RUN wget -O firefox-webdriver https://github.com/mozilla/geckodriver/releases/download/v0.28.0/geckodriver-v0.28.0-linux64.tar.gz

ENV PATH="/app:${PATH}"

COPY . .

RUN npm i

CMD [ "node", "src/index.mjs" ]