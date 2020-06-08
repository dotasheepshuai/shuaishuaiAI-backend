module.exports = {
    SymbolRegex: /[？?。.，,：: ]/g,
    Chinese_Blacklist: ['大白', '蒲素', '前男友', '前女友', '深圳男生', '王越'],
    English_Blacklist: ['bigwhite', 'soup', 'exboyfriend', 'exgirlfriend', 'shenzhenboy', 'yuewang'],
    Chinese_Blacklist_Response: [
        '如果你还想见到明天的太阳，就别跟我提{{blacklistedWord}}！',
        '和我说{{blacklistedWord}}你是想气死我吗？',
        '我警告你最后一次，别讲{{blacklistedWord}}！',
        '再说一次{{blacklistedWord}}你就完蛋了！'
    ],
    English_Blacklist_Response: [
        'Don\'t mention {{blacklistedWord}} to me, if you still wanna stay alive.',
        'Are you trying to make me angry by saying {{blacklistedWord}}?',
        'I\'d like to warn you for the last time - DO NOT SAY {{blacklistedWord}}!',
        'Say {{blacklistedWord}} again, you are done.'
    ]
};